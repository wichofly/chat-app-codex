import { useEffect, useState } from 'react';

export function useResource<T>(
  load: () => Promise<T>,
  dependencies: readonly unknown[],
) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
    dependencies: readonly unknown[];
  }>({ data: null, loading: true, error: null, dependencies });

  useEffect(() => {
    let active = true;
    setState({ data: null, loading: true, error: null, dependencies });
    Promise.resolve()
      .then(load)
      .then((data) => {
        if (active)
          setState({ data, loading: false, error: null, dependencies });
      })
      .catch((error) => {
        if (active)
          setState({
            data: null,
            loading: false,
            error:
              error instanceof Error
                ? error
                : new Error('Something went wrong.'),
            dependencies,
          });
      });
    return () => {
      active = false;
    };
    // Callers explicitly provide the resources that invalidate this request.
  }, dependencies);

  const current =
    dependencies.length === state.dependencies.length &&
    dependencies.every((value, index) =>
      Object.is(value, state.dependencies[index]),
    );

  return current ? state : { data: null, loading: true, error: null };
}
